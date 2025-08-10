# Live Search Collaboration Service - Test Documentation

This document describes the comprehensive test suite for the Live Search Collaboration Service, covering all aspects of collaborative search functionality including real-time synchronization, participant management, and annotation sharing.

## Test Overview

The test suite consists of four main categories:

1. **Unit Tests** - Test individual service methods and React components
2. **Integration Tests** - Test API endpoints and WebSocket communication  
3. **Component Tests** - Test React UI components for collaborative search
4. **End-to-End Tests** - Test complete multi-user collaborative workflows

## Test Files Structure

```
tests/src/
├── unit/
│   ├── live-search-collaboration-service.test.ts      # Service unit tests
│   └── collaborative-search-components.test.tsx      # Component unit tests
├── integration/
│   └── live-search-collaboration-api.test.ts         # API integration tests
└── e2e/
    └── live-search-collaboration-e2e.test.ts          # End-to-end workflow tests
```

## Running Tests

### All Search Collaboration Tests
```bash
npm run test:search-collaboration
```

### By Test Type
```bash
npm run test:search-collaboration:unit        # Unit tests only
npm run test:search-collaboration:integration # Integration tests only
npm run test:search-collaboration:e2e         # End-to-end tests only
npm run test:search-collaboration:components  # Component tests only
```

### Individual Test Files
```bash
# Service unit tests
npm test live-search-collaboration-service.test.ts

# API integration tests  
npm test live-search-collaboration-api.test.ts

# Component tests
npm test collaborative-search-components.test.tsx

# E2E tests
npm test live-search-collaboration-e2e.test.ts
```

### With Coverage
```bash
npm run test:coverage -- --testPathPattern='live-search-collaboration'
```

## Test Categories

### 1. Unit Tests (live-search-collaboration-service.test.ts)

Tests the core `LiveSearchCollaborationService` class with mocked database.

**Coverage Areas:**
- ✅ Search session creation, updates, deactivation
- ✅ Participant management (add, update, remove, roles, permissions)
- ✅ Search state synchronization and conflict detection
- ✅ Annotation CRUD operations (create, read, update, delete)
- ✅ Conflict resolution strategies (last_write_wins, merge, manual)
- ✅ Search history and event recording
- ✅ Analytics and statistics generation
- ✅ Error handling and edge cases
- ✅ Database interaction patterns

**Key Test Scenarios:**
```typescript
// Session Management
test('should create a collaborative search session')
test('should update search session')
test('should deactivate search session')

// Participant Management
test('should add participant to search session')
test('should handle role-based permissions correctly')
test('should remove participant from session')

// State Synchronization
test('should update search state')
test('should handle concurrent state updates with conflict detection')
test('should get all search states for session')

// Annotations
test('should create search annotation')
test('should filter annotations by type and user')
test('should delete annotation')

// Conflict Resolution
test('should detect conflicts in search state')
test('should resolve conflicts using last_write_wins strategy')
test('should resolve conflicts using merge strategy')
```

### 2. Integration Tests (live-search-collaboration-api.test.ts)

Tests REST API endpoints and WebSocket real-time communication with running services.

**Coverage Areas:**
- ✅ REST API endpoints for session management
- ✅ Participant join/leave/update operations
- ✅ Search state management APIs
- ✅ Annotation management APIs
- ✅ WebSocket real-time messaging
- ✅ Authentication and authorization
- ✅ Error handling and validation
- ✅ Concurrent operations and race conditions
- ✅ Performance under load

**Key Test Scenarios:**
```typescript
// Session Management API
test('POST /api/search-collaboration/search-sessions - create search session')
test('GET /api/search-collaboration/search-sessions/:id - get session details')
test('PUT /api/search-collaboration/search-sessions/:id - update session')
test('DELETE /api/search-collaboration/search-sessions/:id - deactivate session')

// Participant Management API
test('POST /api/search-collaboration/search-sessions/:id/join - join session')
test('POST /api/search-collaboration/search-sessions/:id/leave - leave session')
test('PUT /api/search-collaboration/participants/:id - update participant role')

// Real-time WebSocket Integration
test('should receive real-time updates for search query changes')
test('should synchronize filter updates across participants')
test('should broadcast annotation creation to session participants')
test('should handle connection resilience and message acknowledgments')
```

### 3. Component Tests (collaborative-search-components.test.tsx)

Tests React UI components with mocked dependencies and user interactions.

**Coverage Areas:**
- ✅ CollaborativeSearchSession component rendering and behavior
- ✅ SearchAnnotations component functionality
- ✅ CollaborativeParticipants component interactions
- ✅ Custom hooks (useCollaborativeSearch, useSearchCollaboration)
- ✅ User interaction handling (clicks, form submissions, etc.)
- ✅ State management and updates
- ✅ Error and loading states
- ✅ Accessibility features

**Key Test Scenarios:**
```typescript
// CollaborativeSearchSession Component
test('should render session creation when no sessionId provided')
test('should create session when create button clicked')
test('should render active session when sessionId provided')
test('should display connection status')

// SearchAnnotations Component  
test('should render annotations list')
test('should filter annotations by type')
test('should handle annotation creation')
test('should handle annotation editing and deletion')

// CollaborativeParticipants Component
test('should render participants list')
test('should show invite button for moderators')
test('should handle participant management actions')
test('should indicate current user')
```

### 4. End-to-End Tests (live-search-collaboration-e2e.test.ts)

Tests complete multi-user collaborative workflows with multiple real browser sessions.

**Coverage Areas:**
- ✅ Multi-user session joining and management
- ✅ Real-time query synchronization across users
- ✅ Filter collaboration and updates
- ✅ Annotation sharing and real-time updates
- ✅ State synchronization and conflict resolution
- ✅ Connection resilience and recovery
- ✅ Permission-based interactions
- ✅ Performance with multiple concurrent users
- ✅ Edge cases and error scenarios

**Key Test Scenarios:**
```typescript
// Multi-User Session Management
test('should allow multiple users to join the same search session')
test('should handle user leaving and rejoining')

// Real-time Query Synchronization
test('should synchronize search queries across all participants')
test('should handle rapid query updates with debouncing')
test('should synchronize filter updates')

// Collaborative Annotations
test('should share annotations across participants in real-time')
test('should handle annotation editing and resolution')
test('should support different annotation types')

// State Synchronization and Conflict Resolution
test('should handle concurrent state updates')
test('should resolve conflicts using last_write_wins strategy')

// Connection Resilience and Recovery
test('should handle WebSocket disconnection and reconnection')
test('should handle message acknowledgments and retries')
```

## Test Data and Mocking

### Mock Data Structures
The tests use comprehensive mock data that matches the production data structures:

```typescript
interface CollaborativeSearchSession {
  id: string;
  workspace_id: string;
  session_name: string;
  created_by: string;
  is_active: boolean;
  search_settings: Record<string, any>;
  // ... other fields
}

interface SearchSessionParticipant {
  id: string;
  user_id: string;
  role: 'searcher' | 'observer' | 'moderator';
  is_active: boolean;
  can_initiate_search: boolean;
  // ... other fields
}

interface SearchAnnotation {
  id: string;
  annotation_type: 'highlight' | 'note' | 'bookmark' | 'flag';
  annotation_text?: string;
  is_shared: boolean;
  // ... other fields
}
```

### Database Mocking
Unit tests use a comprehensive mock database that simulates:
- Table operations (insert, update, delete, select)
- Query builder patterns
- Transaction behavior
- Constraint validation

### WebSocket Mocking
E2E tests establish real WebSocket connections with:
- Message queuing and acknowledgments
- Connection state management
- Automatic reconnection handling
- Message filtering by session ID

## Coverage Requirements

The test suite aims for comprehensive coverage:

- **Line Coverage**: > 90%
- **Branch Coverage**: > 85%
- **Function Coverage**: > 95%
- **Statement Coverage**: > 90%

### Critical Paths Covered
- ✅ Session creation and lifecycle management
- ✅ Multi-user participant management
- ✅ Real-time state synchronization
- ✅ Annotation collaboration workflows
- ✅ Conflict detection and resolution
- ✅ Error handling and edge cases
- ✅ Performance under concurrent load
- ✅ Connection resilience scenarios

## Performance Benchmarks

The test suite includes performance validation:

### Response Time Expectations
- Session creation: < 500ms
- Participant join: < 300ms  
- State update: < 200ms
- Annotation creation: < 400ms
- WebSocket message delivery: < 100ms

### Concurrency Limits
- 50+ concurrent users per session
- 100+ messages per minute per session
- 10+ simultaneous sessions per workspace

### Load Testing Scenarios
- Multiple simultaneous search sessions
- High-frequency state updates
- Rapid annotation creation/editing
- Connection drops and reconnections

## Error Scenarios Tested

### Network and Connection Issues
- ✅ WebSocket disconnection/reconnection
- ✅ API request timeouts
- ✅ Network partitions during state updates
- ✅ Message delivery failures

### Data Integrity Issues  
- ✅ Concurrent state modifications
- ✅ Conflicting annotation updates
- ✅ Session state corruption
- ✅ Database constraint violations

### Permission and Security Issues
- ✅ Unauthorized session access
- ✅ Permission-based operation restrictions
- ✅ Invalid role assignments
- ✅ Cross-session data leakage

### Edge Cases
- ✅ Empty sessions and no participants
- ✅ Maximum participant limits
- ✅ Extremely long search queries
- ✅ Large annotation datasets
- ✅ Rapid user join/leave cycles

## Test Environment Setup

### Prerequisites
```bash
# Install test dependencies
npm install

# Start required services
npm run start:services

# Run database migrations
cd ../migrations && npm run build && node dist/migrate.js
```

### Environment Variables
```bash
API_BASE_URL=http://localhost:3001
WS_URL=ws://localhost:3001
POSTGRES_PASSWORD=password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=mcp_tools_test
POSTGRES_USER=postgres
```

### Service Dependencies
The tests require these services to be running:
- PostgreSQL database
- API Gateway server
- WebSocket collaboration server
- Core MCP services

## Continuous Integration

### GitHub Actions Integration
```yaml
name: Search Collaboration Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run start:services
      - run: npm run test:search-collaboration
      - run: npm run test:coverage
```

### Test Reporting
Tests generate comprehensive reports:
- JUnit XML for CI integration
- HTML coverage reports
- Performance benchmarks
- Error summaries

## Debugging Tests

### Common Issues
1. **WebSocket Connection Failures**
   - Verify services are running
   - Check authentication tokens
   - Confirm network connectivity

2. **Database Connection Issues**
   - Ensure PostgreSQL is running
   - Verify environment variables
   - Run migrations first

3. **Timing Issues in E2E Tests**
   - Increase timeout values
   - Add proper wait conditions
   - Use explicit synchronization

### Debug Commands
```bash
# Run with verbose output
npm test -- --verbose live-search-collaboration

# Debug specific test
npm test -- --testNamePattern="should synchronize search queries"

# Run with Node debugger
node --inspect-brk node_modules/.bin/jest live-search-collaboration
```

## Future Test Enhancements

### Planned Additions
- Visual regression tests for UI components
- Performance profiling under extreme load  
- Cross-browser compatibility testing
- Mobile responsiveness testing
- Accessibility compliance testing

### Test Data Management
- Automated test data generation
- Database seeding and cleanup
- Test data versioning
- Synthetic user behavior simulation

This comprehensive test suite ensures the Live Search Collaboration Service is robust, performant, and reliable across all usage scenarios and user interactions.