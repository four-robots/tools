# Milestone 5.2.1: Cross-Service Integration

**Milestone ID**: 00004  
**Phase**: 5.2 - Core Features  
**Status**: ⏳ **READY TO BEGIN**  
**Target Start Date**: 2025-01-13  
**Target Completion Date**: 2025-01-20  
**Duration**: 1 week (Phase 5.2 Week 1)

## Reference
**Originating Plan**: @plans/00001-PLAN-realtime-collaborative-whiteboard.md  
**Phase**: Phase 5.2: Core Features (Week 4)  
**Previous Milestone**: @milestones/00003-MILESTONE-realtime-collaboration.md  
**Next Milestone**: @milestones/00005-MILESTONE-advanced-collaboration.md

## Milestone Overview

Implement the unique cross-service integration capabilities that differentiate our whiteboard from all competitors. This milestone adds drag-and-drop functionality for Kanban cards, Wiki content embedding, Memory node attachment, and unified search across all MCP Tools services from within the whiteboard interface.

## Objectives

### Primary Goals ⏳
- [ ] Implement drag-and-drop integration for Kanban cards onto whiteboard canvas
- [ ] Create Wiki content embedding and synchronization system
- [ ] Develop Memory node attachment and visual representation
- [ ] Build unified search interface accessible from whiteboard
- [ ] Create bi-directional synchronization between whiteboard and external resources

### Success Criteria ⏳
- [ ] Users can drag Kanban cards directly onto whiteboard and see live updates
- [ ] Wiki pages can be embedded as whiteboard elements with content sync
- [ ] Memory nodes appear as interactive elements with relationship visualization
- [ ] Search from whiteboard can find and attach resources from all services
- [ ] Changes in external services reflect in real-time on attached whiteboard elements

## Technical Requirements

### Cross-Service Architecture

#### Service Integration Layer
**New Service**: `core/src/services/whiteboard/whiteboard-integration-service.ts`

**Integration Capabilities**:
- **Kanban Integration**: Drag cards, sync status changes, create tasks from whiteboard
- **Wiki Integration**: Embed pages, sync content updates, create pages from whiteboard
- **Memory Integration**: Attach nodes, visualize relationships, create connections
- **Search Integration**: Unified search across all services with result attachment

#### Resource Attachment System
**Database Extensions**: Extend existing whiteboard tables

**New Tables/Fields**:
- `whiteboard_resource_attachments` - Links between whiteboard elements and external resources
- `whiteboard_search_cache` - Cache search results for performance
- `whiteboard_sync_status` - Track synchronization state of attached resources

### Kanban Integration Implementation

#### Drag-and-Drop Kanban Cards ⏳
**Implementation Requirements**:

**Backend Components**:
- Extend WhiteboardElementService to handle Kanban card elements
- Create KanbanCardElement type with live sync capabilities
- Implement card status change webhooks for real-time updates
- Add card creation API from whiteboard sketches/notes

**Frontend Components**:
- `KanbanCardElement.tsx` - Visual representation of cards on canvas
- `KanbanDragSource.tsx` - Drag source for cards from Kanban boards
- `KanbanDropTarget.tsx` - Drop target handling on whiteboard canvas
- `KanbanCardSync.tsx` - Real-time sync indicator for card changes

**Integration Features**:
- **Visual Representation**: Cards appear as structured elements with title, description, status
- **Live Updates**: Card status changes reflect immediately on whiteboard
- **Bi-directional Sync**: Moving cards on whiteboard updates Kanban board
- **Status Workflow**: Card status changes trigger visual updates and notifications
- **Task Creation**: Sketched ideas can be converted to Kanban tasks

### Wiki Integration Implementation

#### Wiki Content Embedding ⏳
**Implementation Requirements**:

**Backend Components**:
- Extend WhiteboardElementService for Wiki page elements
- Create WikiPageElement type with content synchronization
- Implement Wiki content change notifications
- Add page creation API from whiteboard text/notes

**Frontend Components**:
- `WikiPageElement.tsx` - Embedded Wiki page with live content
- `WikiSearchModal.tsx` - Search and select Wiki pages for embedding
- `WikiContentSync.tsx` - Live content synchronization indicator
- `WikiPageCreator.tsx` - Create new Wiki pages from whiteboard content

**Integration Features**:
- **Content Embedding**: Wiki pages appear as readable content blocks
- **Live Sync**: Wiki edits reflect immediately in embedded content
- **Version Awareness**: Show when embedded content has been updated
- **Content Creation**: Convert whiteboard text to Wiki pages
- **Link Network**: Visual connections between related Wiki pages

### Memory Integration Implementation

#### Memory Node Attachment ⏳
**Implementation Requirements**:

**Backend Components**:
- Extend WhiteboardElementService for Memory node elements
- Create MemoryNodeElement type with relationship visualization
- Implement Memory graph change notifications
- Add node creation and linking APIs

**Frontend Components**:
- `MemoryNodeElement.tsx` - Visual node representation with relationships
- `MemoryGraphViewer.tsx` - Mini graph view for connected nodes
- `MemorySearchModal.tsx` - Search and attach Memory nodes
- `MemoryRelationshipLines.tsx` - Visual connections between nodes

**Integration Features**:
- **Node Visualization**: Memory nodes appear as interactive graph elements
- **Relationship Lines**: Visual connections between related nodes
- **Graph Navigation**: Click nodes to explore connections
- **Knowledge Creation**: Create new Memory nodes from whiteboard concepts
- **Relationship Mapping**: Draw connections that create Memory relationships

### Unified Search Implementation

#### Search-to-Attach System ⏳
**Implementation Requirements**:

**Backend Components**:
- Create UnifiedSearchService for cross-service searching
- Implement search result ranking and relevance scoring
- Add search result caching for performance
- Create resource attachment APIs

**Frontend Components**:
- `UnifiedSearchModal.tsx` - Search interface within whiteboard
- `SearchResultList.tsx` - Display results from all services
- `ResourceAttachmentPreview.tsx` - Preview before attaching
- `SearchResultElements.tsx` - Various element types for different resources

**Search Features**:
- **Cross-Service Search**: Search Kanban, Wiki, Memory from single interface
- **Smart Ranking**: Relevance-based result ordering
- **Preview Before Attach**: See resource preview before adding to canvas
- **Bulk Attachment**: Select multiple resources for batch attachment
- **Search History**: Recent and popular searches for quick access

## API Design Extensions

### Cross-Service Endpoints ⏳
**New API Routes**:

```typescript
# Resource Attachment
GET    /api/v1/whiteboards/:id/attachments           # List attached resources
POST   /api/v1/whiteboards/:id/attachments          # Attach resource to whiteboard
DELETE /api/v1/whiteboards/:id/attachments/:id      # Remove attachment

# Unified Search
GET    /api/v1/whiteboards/:id/search               # Search across all services
POST   /api/v1/whiteboards/:id/search/attach        # Attach search result

# Kanban Integration
POST   /api/v1/whiteboards/:id/kanban/cards         # Attach Kanban card
PUT    /api/v1/whiteboards/:id/kanban/cards/:id     # Update card status
POST   /api/v1/whiteboards/:id/kanban/create-card   # Create card from whiteboard

# Wiki Integration
POST   /api/v1/whiteboards/:id/wiki/pages           # Attach Wiki page
POST   /api/v1/whiteboards/:id/wiki/create-page     # Create page from whiteboard

# Memory Integration  
POST   /api/v1/whiteboards/:id/memory/nodes         # Attach Memory node
POST   /api/v1/whiteboards/:id/memory/create-node   # Create node from whiteboard
POST   /api/v1/whiteboards/:id/memory/relationships # Create relationships
```

### WebSocket Events for Cross-Service ⏳
**New Real-time Events**:

```typescript
# Resource Synchronization
'whiteboard:resource_updated'    // External resource changed
'whiteboard:resource_attached'   // New resource attached
'whiteboard:resource_detached'   // Resource removed

# Service-Specific Events
'whiteboard:kanban_card_moved'   // Kanban card status changed
'whiteboard:wiki_page_updated'   // Wiki page content changed
'whiteboard:memory_node_linked'  // Memory relationship created

# Search Events
'whiteboard:search_results'      // Search results available
'whiteboard:resource_previewed'  // Resource preview requested
```

## Database Schema Extensions

### Resource Attachment Table ⏳
```sql
CREATE TABLE whiteboard_resource_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whiteboard_id UUID NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
    element_id UUID NOT NULL,
    resource_type VARCHAR(50) NOT NULL, -- 'kanban_card', 'wiki_page', 'memory_node'
    resource_id UUID NOT NULL,
    attachment_metadata JSONB NOT NULL DEFAULT '{}',
    sync_status VARCHAR(20) DEFAULT 'active', -- 'active', 'stale', 'error'
    last_sync_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Search Cache Table ⏳
```sql
CREATE TABLE whiteboard_search_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    whiteboard_id UUID NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
    search_query TEXT NOT NULL,
    search_results JSONB NOT NULL,
    result_count INTEGER NOT NULL,
    search_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour')
);
```

## Frontend Component Architecture

### Integration UI Components ⏳

```typescript
# Resource Elements (Canvas)
components/whiteboard/elements/
├── KanbanCardElement.tsx        # Kanban card on canvas
├── WikiPageElement.tsx          # Embedded Wiki content
├── MemoryNodeElement.tsx        # Memory node visualization
└── ResourceElementFactory.tsx   # Factory for resource elements

# Search Interface
components/whiteboard/search/
├── UnifiedSearchModal.tsx       # Main search interface  
├── SearchResultList.tsx         # Results display
├── ResourcePreview.tsx          # Preview before attach
└── SearchFilters.tsx           # Filter by service type

# Integration Panels
components/whiteboard/panels/
├── ResourcePanel.tsx            # Attached resources sidebar
├── KanbanPanel.tsx             # Kanban integration controls
├── WikiPanel.tsx               # Wiki integration controls
└── MemoryPanel.tsx             # Memory graph controls

# Drag and Drop
components/whiteboard/dragdrop/
├── DragSource.tsx              # Generic drag source
├── DropTarget.tsx              # Canvas drop target
├── DragPreview.tsx             # Drag preview component
└── DropIndicator.tsx           # Drop zone indicators
```

### Integration Hooks ⏳

```typescript
# Resource Management
hooks/
├── useResourceAttachment.ts     # Attach/detach resources
├── useResourceSync.ts           # Real-time sync status
├── useUnifiedSearch.ts          # Cross-service search
└── useResourcePreview.ts        # Resource preview data

# Service-Specific Hooks
├── useKanbanIntegration.ts      # Kanban card operations
├── useWikiIntegration.ts        # Wiki page operations  
├── useMemoryIntegration.ts      # Memory node operations
└── useCrossServiceSync.ts       # Sync coordination
```

## Performance Requirements

### Search Performance ⏳
- **Response Time**: <300ms for unified search across all services
- **Result Caching**: 1-hour cache for frequently searched terms
- **Incremental Search**: Real-time search suggestions as user types
- **Result Ranking**: Relevance-based ordering with user history weighting

### Sync Performance ⏳
- **Real-time Updates**: <500ms for resource change propagation
- **Batch Operations**: Efficient bulk attachment and detachment
- **Conflict Resolution**: Handle simultaneous changes across services
- **Connection Health**: Monitor and recover from service connection issues

### Visual Performance ⏳
- **Element Rendering**: Smooth rendering with 100+ attached resources
- **Drag Operations**: <16ms frame time during drag-and-drop
- **Search UI**: Instant search interface with no perceptible delay
- **Resource Previews**: Fast loading of preview content

## Integration Testing Strategy

### Cross-Service Testing ⏳
- **Service Integration**: Test all service combinations (Kanban + Wiki + Memory)
- **Real-time Sync**: Validate bi-directional synchronization
- **Error Handling**: Test behavior when services are unavailable
- **Performance Load**: Test with large numbers of attached resources

### User Experience Testing ⏳
- **Drag-and-Drop UX**: Validate intuitive drag-drop interactions
- **Search Experience**: Test search relevance and speed
- **Visual Feedback**: Ensure clear indicators for all states
- **Mobile Experience**: Touch-friendly resource management

## Success Metrics

### Feature Adoption ⏳
- **Cross-Service Usage**: 60% of whiteboards use at least one integration
- **Search Utilization**: 40% of sessions include unified search
- **Resource Attachment**: Average 5+ attached resources per whiteboard
- **Bi-directional Sync**: 80% of attached resources show live updates

### User Engagement ⏳
- **Session Duration**: 15% increase in average whiteboard session time
- **Task Creation**: 30% of whiteboard sessions create Kanban tasks
- **Wiki Integration**: 25% of whiteboards link to Wiki pages
- **Knowledge Capture**: 20% increase in Memory node creation

### Performance Metrics ⏳
- **Search Latency**: <300ms average response time
- **Sync Reliability**: 99% successful real-time updates
- **UI Responsiveness**: <16ms frame time during interactions
- **Error Recovery**: <5% failed synchronization rate

## Risk Assessment

### Technical Risks ⏳
- **Medium**: Service dependency complexity with multiple integrations
- **Medium**: Real-time synchronization conflicts across services  
- **Low**: Search performance with large data sets
- **Low**: UI complexity with multiple resource types

### Mitigation Strategies ⏳
- **Circuit Breakers**: Graceful degradation when services unavailable
- **Conflict Resolution**: Clear precedence rules for simultaneous changes
- **Performance Monitoring**: Real-time metrics for all integration points
- **Fallback UI**: Simplified interface when integrations fail

## Future Enhancements

### Advanced Integrations ⏳
- **Smart Suggestions**: AI-powered resource recommendations
- **Workflow Automation**: Trigger actions based on whiteboard changes
- **Template Integration**: Templates that include pre-configured integrations
- **External APIs**: Integration with third-party services

### Enhanced Visualization ⏳
- **Relationship Mapping**: Visual connections between all resource types
- **Data Flow Visualization**: Show information flow between services
- **Interactive Dashboards**: Embedded analytics from attached resources
- **Collaborative Filtering**: Team-based resource recommendations

---

**Milestone Status**: ⏳ **READY TO BEGIN**  
**Quality Gate**: ⏳ **PENDING IMPLEMENTATION**  
**Prerequisites**: ✅ Phase 5.1 Foundation Complete  

**Generated**: 2025-01-12  
**Target Start**: 2025-01-13  
**Target Completion**: 2025-01-20  
**Previous**: @milestones/00003-MILESTONE-realtime-collaboration.md  
**Next**: @milestones/00005-MILESTONE-advanced-collaboration.md