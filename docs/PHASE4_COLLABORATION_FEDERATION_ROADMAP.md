# Phase 4: Real-time Collaboration & Federation Roadmap

## Overview

Phase 4 represents the culmination of the unified search platform evolution, introducing comprehensive real-time collaboration features and federation capabilities. This phase transforms the system from a powerful search platform into a collaborative knowledge ecosystem with multi-tenant support, real-time synchronization, and distributed architecture capabilities.

**Timeline**: 10-12 weeks  
**Complexity**: Expert Level  
**Dependencies**: Phases 1, 2, and 3 must be completed

## Key Features & Capabilities

### Real-time Collaboration Engine
- **Live Multi-user Search Sessions**: Multiple users collaborating on search queries simultaneously
- **Shared Search Workspaces**: Persistent collaborative environments with shared filters and results
- **Real-time Annotations**: Live comments, highlights, and annotations on search results
- **Collaborative Filtering**: Team-based filter presets and shared search configurations
- **Live Cursors & Presence**: Visual indicators showing where team members are searching

### Federation & Multi-tenant Architecture
- **Cross-organization Search**: Federated search across multiple organizational boundaries
- **Content Syndication**: Controlled sharing of search indices between organizations
- **Distributed Indexing**: Multi-node content processing and vector storage
- **Tenant Isolation**: Secure multi-tenant data separation and access controls
- **API Federation**: Cross-platform search integration with external systems

### Advanced Synchronization
- **Conflict Resolution**: Intelligent merge strategies for concurrent edits and annotations
- **Version Control**: Complete audit trail for collaborative search sessions and shared content
- **Offline Synchronization**: Robust sync capabilities for disconnected collaboration
- **Delta Synchronization**: Efficient real-time updates with minimal data transfer
- **Event Sourcing**: Complete reconstruction of collaborative sessions and user interactions

## Technical Architecture

### Real-time Infrastructure
```typescript
// WebSocket Gateway with horizontal scaling
interface CollaborationGateway {
  rooms: Map<string, CollaborationRoom>;
  presence: Map<string, UserPresence>;
  synchronization: SyncEngine;
  conflictResolution: ConflictResolver;
}

// Distributed event system
interface DistributedEvents {
  eventStore: EventStore;
  eventBus: MessageBroker;
  projections: ProjectionManager;
  snapshots: SnapshotStore;
}
```

### Federation Protocol
```typescript
// Cross-organization federation
interface FederationProtocol {
  trustNetwork: TrustNetwork;
  contentSyndication: SyndicationManager;
  accessControl: FederatedACL;
  searchRouting: QueryRouter;
}
```

## Work Items Breakdown

---

## Work Item 4.1: Real-time Collaboration Infrastructure

### Work Item 4.1.1: WebSocket Collaboration Gateway
**Agent**: @agent-nodejs-backend-engineer  
**Estimated Time**: 2 weeks  
**Priority**: Critical

#### Technical Requirements
- Horizontally scalable WebSocket gateway with Redis clustering
- Room-based collaboration with presence management
- Real-time event broadcasting with message ordering
- Connection state management and automatic reconnection
- Rate limiting and abuse protection

#### Database Schema Extensions
```sql
-- Collaboration Sessions
CREATE TABLE collaboration_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    session_name VARCHAR(255) NOT NULL,
    session_type VARCHAR(50) NOT NULL, -- 'search', 'analysis', 'review'
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE,
    settings JSONB NOT NULL DEFAULT '{}',
    INDEX idx_collaboration_sessions_workspace (workspace_id),
    INDEX idx_collaboration_sessions_type (session_type),
    INDEX idx_collaboration_sessions_created_by (created_by)
);

-- Session Participants
CREATE TABLE session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'participant', -- 'owner', 'moderator', 'participant', 'observer'
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    permissions JSONB NOT NULL DEFAULT '{}',
    UNIQUE(session_id, user_id),
    INDEX idx_session_participants_session (session_id),
    INDEX idx_session_participants_user (user_id)
);

-- Real-time Events
CREATE TABLE collaboration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    sequence_number BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    INDEX idx_collaboration_events_session_seq (session_id, sequence_number),
    INDEX idx_collaboration_events_type (event_type),
    INDEX idx_collaboration_events_user (user_id)
);

-- User Presence
CREATE TABLE user_presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'online', -- 'online', 'idle', 'busy', 'offline'
    current_location JSONB, -- Current search context, page, filters
    cursor_position JSONB, -- Real-time cursor/focus information
    last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    connection_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, session_id),
    INDEX idx_user_presence_session (session_id),
    INDEX idx_user_presence_status (status)
);
```

#### Implementation Files

**Gateway Service**
```typescript
// gateway/src/collaboration/websocket-gateway.ts
import { WebSocketServer, WebSocket } from 'ws';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';

export interface CollaborationMessage {
  type: 'join' | 'leave' | 'search' | 'filter' | 'annotation' | 'cursor' | 'presence';
  sessionId: string;
  userId: string;
  data: Record<string, any>;
  timestamp: Date;
  sequenceNumber: number;
}

export interface CollaborationRoom {
  id: string;
  participants: Map<string, UserConnection>;
  eventHistory: CollaborationMessage[];
  lastActivity: Date;
  settings: CollaborationSettings;
}

export class CollaborationGateway extends EventEmitter {
  private wss: WebSocketServer;
  private redis: Redis;
  private rooms = new Map<string, CollaborationRoom>();
  private connections = new Map<string, UserConnection>();

  constructor(server: any, redisUrl: string) {
    super();
    this.wss = new WebSocketServer({ server });
    this.redis = new Redis(redisUrl);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', this.handleConnection.bind(this));
    this.redis.on('message', this.handleRedisMessage.bind(this));
  }

  private async handleConnection(ws: WebSocket, request: any): Promise<void> {
    // Authentication and connection setup
    const userId = await this.authenticateConnection(request);
    const connection = new UserConnection(ws, userId);
    
    this.connections.set(connection.id, connection);
    
    ws.on('message', (data) => this.handleMessage(connection, data));
    ws.on('close', () => this.handleDisconnection(connection));
  }

  private async handleMessage(
    connection: UserConnection, 
    data: any
  ): Promise<void> {
    try {
      const message: CollaborationMessage = JSON.parse(data.toString());
      await this.processMessage(connection, message);
    } catch (error) {
      connection.sendError('Invalid message format');
    }
  }

  private async processMessage(
    connection: UserConnection,
    message: CollaborationMessage
  ): Promise<void> {
    const room = await this.getOrCreateRoom(message.sessionId);
    
    switch (message.type) {
      case 'join':
        await this.handleJoinRoom(connection, room, message);
        break;
      case 'search':
        await this.handleSearchEvent(connection, room, message);
        break;
      case 'filter':
        await this.handleFilterEvent(connection, room, message);
        break;
      case 'annotation':
        await this.handleAnnotationEvent(connection, room, message);
        break;
      case 'cursor':
        await this.handleCursorEvent(connection, room, message);
        break;
    }
  }

  private async broadcastToRoom(
    roomId: string,
    message: CollaborationMessage,
    excludeUserId?: string
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const broadcastPromises = Array.from(room.participants.values())
      .filter(participant => participant.userId !== excludeUserId)
      .map(participant => participant.send(message));

    await Promise.all(broadcastPromises);
    
    // Broadcast to other gateway instances via Redis
    await this.redis.publish(`collaboration:${roomId}`, JSON.stringify(message));
  }
}

export class UserConnection {
  public readonly id: string;
  public readonly userId: string;
  private ws: WebSocket;
  private lastActivity: Date = new Date();

  constructor(ws: WebSocket, userId: string) {
    this.id = crypto.randomUUID();
    this.userId = userId;
    this.ws = ws;
  }

  async send(message: CollaborationMessage): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      this.lastActivity = new Date();
    }
  }

  sendError(error: string): void {
    this.send({
      type: 'error',
      sessionId: '',
      userId: this.userId,
      data: { error },
      timestamp: new Date(),
      sequenceNumber: 0
    } as any);
  }
}
```

#### Acceptance Criteria
- [ ] WebSocket gateway handles 1000+ concurrent connections per instance
- [ ] Redis clustering enables horizontal scaling across multiple gateway instances  
- [ ] Room-based collaboration with proper participant management
- [ ] Real-time event broadcasting with message ordering guarantees
- [ ] Comprehensive error handling and automatic reconnection support
- [ ] Rate limiting prevents abuse and ensures system stability
- [ ] Complete unit and integration test coverage
- [ ] Monitoring and metrics for connection health and performance

---

### Work Item 4.1.2: Live Search Collaboration Service
**Agent**: @agent-fullstack-feature-developer  
**Estimated Time**: 2 weeks  
**Priority**: Critical

#### Technical Requirements
- Synchronized search state across multiple users
- Real-time filter sharing and collaborative query building
- Live result annotations and collaborative bookmarking
- Conflict resolution for simultaneous search modifications
- Persistent collaboration sessions with history

#### Implementation Files

**Collaboration Service**
```typescript
// core/src/services/collaboration/live-search-service.ts
import { EventEmitter } from 'events';
import { CollaborationMessage, SearchState, UserPresence } from '@types/collaboration';
import { UnifiedSearchService } from '../search/unified-search-service';

export interface CollaborativeSearchSession {
  id: string;
  workspaceId: string;
  participants: Map<string, SearchParticipant>;
  sharedState: SharedSearchState;
  history: SearchHistoryEntry[];
  settings: CollaborationSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface SharedSearchState {
  query: string;
  filters: SearchFilters;
  sort: SortOptions;
  results: SearchResultWithAnnotations[];
  bookmarks: SharedBookmark[];
  annotations: SearchAnnotation[];
  lastModifiedBy: string;
  lastModifiedAt: Date;
  version: number;
}

export interface SearchParticipant {
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  presence: UserPresence;
  permissions: ParticipantPermissions;
  joinedAt: Date;
  lastSeenAt: Date;
}

export class LiveSearchCollaborationService extends EventEmitter {
  private sessions = new Map<string, CollaborativeSearchSession>();
  private searchService: UnifiedSearchService;

  constructor(searchService: UnifiedSearchService) {
    super();
    this.searchService = searchService;
  }

  async createSession(
    workspaceId: string,
    createdBy: string,
    settings?: Partial<CollaborationSettings>
  ): Promise<CollaborativeSearchSession> {
    const session: CollaborativeSearchSession = {
      id: crypto.randomUUID(),
      workspaceId,
      participants: new Map(),
      sharedState: {
        query: '',
        filters: {},
        sort: { field: 'relevance', direction: 'desc' },
        results: [],
        bookmarks: [],
        annotations: [],
        lastModifiedBy: createdBy,
        lastModifiedAt: new Date(),
        version: 1
      },
      history: [],
      settings: {
        allowGuestAccess: false,
        requireApprovalForEdits: false,
        maxParticipants: 50,
        ...settings
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add creator as owner
    session.participants.set(createdBy, {
      userId: createdBy,
      role: 'owner',
      presence: { status: 'online', location: 'search' },
      permissions: { canEdit: true, canInvite: true, canModerate: true },
      joinedAt: new Date(),
      lastSeenAt: new Date()
    });

    this.sessions.set(session.id, session);
    return session;
  }

  async joinSession(
    sessionId: string,
    userId: string,
    role: 'editor' | 'viewer' = 'viewer'
  ): Promise<CollaborativeSearchSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const participant: SearchParticipant = {
      userId,
      role,
      presence: { status: 'online', location: 'search' },
      permissions: this.getDefaultPermissions(role),
      joinedAt: new Date(),
      lastSeenAt: new Date()
    };

    session.participants.set(userId, participant);
    session.updatedAt = new Date();

    this.emit('participant-joined', { sessionId, userId, participant });
    return session;
  }

  async updateSearchQuery(
    sessionId: string,
    userId: string,
    query: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(userId);
    if (!participant?.permissions.canEdit) {
      throw new Error('Insufficient permissions');
    }

    // Create history entry
    this.addHistoryEntry(session, 'query_changed', {
      previousQuery: session.sharedState.query,
      newQuery: query,
      changedBy: userId
    });

    // Update shared state
    session.sharedState.query = query;
    session.sharedState.lastModifiedBy = userId;
    session.sharedState.lastModifiedAt = new Date();
    session.sharedState.version++;

    // Execute search and update results
    const searchResults = await this.searchService.search({
      query,
      filters: session.sharedState.filters,
      sort: session.sharedState.sort,
      pagination: { page: 1, size: 20 }
    });

    session.sharedState.results = searchResults.results.map(result => ({
      ...result,
      annotations: [],
      collaborativeBookmarks: []
    }));

    this.emit('search-updated', { sessionId, userId, searchResults });
  }

  async updateFilters(
    sessionId: string,
    userId: string,
    filters: SearchFilters
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(userId);
    if (!participant?.permissions.canEdit) {
      throw new Error('Insufficient permissions');
    }

    this.addHistoryEntry(session, 'filters_changed', {
      previousFilters: session.sharedState.filters,
      newFilters: filters,
      changedBy: userId
    });

    session.sharedState.filters = filters;
    session.sharedState.lastModifiedBy = userId;
    session.sharedState.lastModifiedAt = new Date();
    session.sharedState.version++;

    // Re-execute search with new filters
    if (session.sharedState.query) {
      await this.updateSearchQuery(sessionId, userId, session.sharedState.query);
    }

    this.emit('filters-updated', { sessionId, userId, filters });
  }

  async addAnnotation(
    sessionId: string,
    userId: string,
    resultId: string,
    annotation: Omit<SearchAnnotation, 'id' | 'createdBy' | 'createdAt'>
  ): Promise<SearchAnnotation> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const fullAnnotation: SearchAnnotation = {
      ...annotation,
      id: crypto.randomUUID(),
      createdBy: userId,
      createdAt: new Date()
    };

    session.sharedState.annotations.push(fullAnnotation);
    session.sharedState.version++;

    this.emit('annotation-added', { 
      sessionId, 
      userId, 
      resultId, 
      annotation: fullAnnotation 
    });

    return fullAnnotation;
  }

  private addHistoryEntry(
    session: CollaborativeSearchSession,
    action: string,
    data: Record<string, any>
  ): void {
    session.history.push({
      id: crypto.randomUUID(),
      action,
      data,
      timestamp: new Date(),
      version: session.sharedState.version
    });

    // Keep only last 100 history entries
    if (session.history.length > 100) {
      session.history = session.history.slice(-100);
    }
  }

  private getDefaultPermissions(role: 'editor' | 'viewer'): ParticipantPermissions {
    switch (role) {
      case 'editor':
        return { canEdit: true, canInvite: false, canModerate: false };
      case 'viewer':
        return { canEdit: false, canInvite: false, canModerate: false };
    }
  }
}
```

**React Collaboration Components**
```typescript
// web/src/components/search/collaboration/CollaborativeSearchProvider.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { CollaborativeSearchSession, SearchParticipant } from '@types/collaboration';
import { useWebSocket } from '@/hooks/useWebSocket';

interface CollaborativeSearchContextType {
  session: CollaborativeSearchSession | null;
  participants: SearchParticipant[];
  isConnected: boolean;
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  updateQuery: (query: string) => Promise<void>;
  updateFilters: (filters: any) => Promise<void>;
  addAnnotation: (resultId: string, annotation: any) => Promise<void>;
}

const CollaborativeSearchContext = createContext<CollaborativeSearchContextType | null>(null);

export function CollaborativeSearchProvider({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const [session, setSession] = useState<CollaborativeSearchSession | null>(null);
  const [participants, setParticipants] = useState<SearchParticipant[]>([]);
  const { socket, isConnected, send } = useWebSocket('/collaboration');

  useEffect(() => {
    if (!socket) return;

    socket.on('session-joined', handleSessionJoined);
    socket.on('participant-joined', handleParticipantJoined);
    socket.on('search-updated', handleSearchUpdated);
    socket.on('filters-updated', handleFiltersUpdated);
    socket.on('annotation-added', handleAnnotationAdded);

    return () => {
      socket.off('session-joined', handleSessionJoined);
      socket.off('participant-joined', handleParticipantJoined);
      socket.off('search-updated', handleSearchUpdated);
      socket.off('filters-updated', handleFiltersUpdated);
      socket.off('annotation-added', handleAnnotationAdded);
    };
  }, [socket]);

  const joinSession = async (sessionId: string): Promise<void> => {
    await send({
      type: 'join',
      sessionId,
      data: { role: 'editor' }
    });
  };

  const updateQuery = async (query: string): Promise<void> => {
    if (!session) return;
    
    await send({
      type: 'search',
      sessionId: session.id,
      data: { query }
    });
  };

  const updateFilters = async (filters: any): Promise<void> => {
    if (!session) return;
    
    await send({
      type: 'filter',
      sessionId: session.id,
      data: { filters }
    });
  };

  const addAnnotation = async (resultId: string, annotation: any): Promise<void> => {
    if (!session) return;
    
    await send({
      type: 'annotation',
      sessionId: session.id,
      data: { resultId, annotation }
    });
  };

  const handleSessionJoined = (data: any) => {
    setSession(data.session);
    setParticipants(Array.from(data.session.participants.values()));
  };

  const handleParticipantJoined = (data: any) => {
    setParticipants(prev => [...prev, data.participant]);
  };

  const handleSearchUpdated = (data: any) => {
    if (session) {
      setSession({
        ...session,
        sharedState: {
          ...session.sharedState,
          query: data.query,
          results: data.results
        }
      });
    }
  };

  const handleFiltersUpdated = (data: any) => {
    if (session) {
      setSession({
        ...session,
        sharedState: {
          ...session.sharedState,
          filters: data.filters
        }
      });
    }
  };

  const handleAnnotationAdded = (data: any) => {
    if (session) {
      setSession({
        ...session,
        sharedState: {
          ...session.sharedState,
          annotations: [...session.sharedState.annotations, data.annotation]
        }
      });
    }
  };

  const leaveSession = async (): Promise<void> => {
    if (session) {
      await send({
        type: 'leave',
        sessionId: session.id,
        data: {}
      });
      setSession(null);
      setParticipants([]);
    }
  };

  return (
    <CollaborativeSearchContext.Provider value={{
      session,
      participants,
      isConnected,
      joinSession,
      leaveSession,
      updateQuery,
      updateFilters,
      addAnnotation
    }}>
      {children}
    </CollaborativeSearchContext.Provider>
  );
}

export const useCollaborativeSearch = () => {
  const context = useContext(CollaborativeSearchContext);
  if (!context) {
    throw new Error('useCollaborativeSearch must be used within CollaborativeSearchProvider');
  }
  return context;
};
```

#### Acceptance Criteria
- [ ] Multiple users can simultaneously search and see real-time updates
- [ ] Collaborative filters with conflict resolution for simultaneous changes
- [ ] Live annotations on search results with user attribution
- [ ] Persistent collaboration sessions with complete interaction history
- [ ] Role-based permissions for session management and content editing
- [ ] Optimistic UI updates with fallback for connection issues
- [ ] Complete test coverage including multi-user scenarios

---

## Work Item 4.2: Federation Architecture

### Work Item 4.2.1: Multi-tenant Search Infrastructure
**Agent**: @agent-devops-infrastructure-engineer  
**Estimated Time**: 3 weeks  
**Priority**: High

#### Technical Requirements
- Complete tenant isolation at database, storage, and search index levels
- Horizontal scaling with tenant-aware load balancing
- Federation protocol for cross-tenant search capabilities
- Comprehensive audit logging and compliance features
- Performance monitoring per tenant with resource quotas

#### Database Schema for Multi-tenancy
```sql
-- Organizations (Tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    domain VARCHAR(255),
    plan_type VARCHAR(50) NOT NULL DEFAULT 'basic', -- 'basic', 'professional', 'enterprise'
    settings JSONB NOT NULL DEFAULT '{}',
    resource_quotas JSONB NOT NULL DEFAULT '{}', -- storage, users, api_calls
    federation_settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    INDEX idx_organizations_slug (slug),
    INDEX idx_organizations_domain (domain),
    INDEX idx_organizations_plan (plan_type)
);

-- Organization Memberships
CREATE TABLE organization_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member', 'guest'
    permissions JSONB NOT NULL DEFAULT '{}',
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_active_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(organization_id, user_id),
    INDEX idx_org_memberships_org (organization_id),
    INDEX idx_org_memberships_user (user_id),
    INDEX idx_org_memberships_role (role)
);

-- Federation Relationships
CREATE TABLE federation_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    target_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL, -- 'trusted', 'partner', 'subsidiary'
    sharing_level VARCHAR(50) NOT NULL DEFAULT 'none', -- 'none', 'metadata', 'content', 'full'
    permissions JSONB NOT NULL DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(source_org_id, target_org_id),
    INDEX idx_federation_source (source_org_id),
    INDEX idx_federation_target (target_org_id),
    INDEX idx_federation_type (relationship_type),
    CONSTRAINT chk_federation_no_self_reference CHECK (source_org_id != target_org_id)
);

-- Shared Search Indices
CREATE TABLE shared_search_indices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sharing_orgs UUID[] NOT NULL DEFAULT '{}',
    index_config JSONB NOT NULL DEFAULT '{}',
    content_types VARCHAR(100)[] NOT NULL DEFAULT '{}',
    access_level VARCHAR(50) NOT NULL DEFAULT 'private', -- 'private', 'shared', 'public'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    INDEX idx_shared_indices_owner (owner_org_id),
    INDEX idx_shared_indices_access (access_level),
    INDEX idx_shared_indices_content_types USING GIN(content_types)
);

-- Tenant Resource Usage Tracking
CREATE TABLE tenant_resource_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    resource_type VARCHAR(100) NOT NULL, -- 'storage', 'api_calls', 'search_queries', 'collaborations'
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    usage_amount BIGINT NOT NULL DEFAULT 0,
    quota_amount BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(organization_id, resource_type, period_start),
    INDEX idx_tenant_usage_org (organization_id),
    INDEX idx_tenant_usage_period (period_start, period_end),
    INDEX idx_tenant_usage_type (resource_type)
);
```

#### Implementation Files

**Multi-tenant Service Layer**
```typescript
// core/src/services/multi-tenant/tenant-service.ts
import { DatabaseManager } from '../database/database-manager';
import { CacheManager } from '../cache/cache-manager';

export interface TenantContext {
  organizationId: string;
  userId: string;
  permissions: TenantPermissions;
  resourceQuotas: ResourceQuotas;
  federationSettings: FederationSettings;
}

export interface ResourceQuotas {
  storage: { used: number; limit: number };
  apiCalls: { used: number; limit: number; resetDate: Date };
  searchQueries: { used: number; limit: number; resetDate: Date };
  collaborativeUsers: { used: number; limit: number };
}

export class MultiTenantService {
  private db: DatabaseManager;
  private cache: CacheManager;
  private contextCache = new Map<string, TenantContext>();

  constructor(db: DatabaseManager, cache: CacheManager) {
    this.db = db;
    this.cache = cache;
  }

  async getTenantContext(
    organizationId: string,
    userId: string
  ): Promise<TenantContext> {
    const cacheKey = `tenant:${organizationId}:${userId}`;
    
    // Check cache first
    if (this.contextCache.has(cacheKey)) {
      return this.contextCache.get(cacheKey)!;
    }

    // Fetch from database
    const [organization, membership, usage] = await Promise.all([
      this.getOrganization(organizationId),
      this.getMembership(organizationId, userId),
      this.getResourceUsage(organizationId)
    ]);

    if (!organization || !membership) {
      throw new Error('Invalid tenant context');
    }

    const context: TenantContext = {
      organizationId,
      userId,
      permissions: this.calculatePermissions(membership, organization),
      resourceQuotas: this.calculateQuotas(organization, usage),
      federationSettings: organization.federation_settings
    };

    // Cache for 5 minutes
    this.contextCache.set(cacheKey, context);
    setTimeout(() => this.contextCache.delete(cacheKey), 5 * 60 * 1000);

    return context;
  }

  async createTenantDatabase(organizationId: string): Promise<void> {
    const dbName = `tenant_${organizationId.replace(/-/g, '_')}`;
    
    await this.db.query(`CREATE DATABASE ${dbName}`);
    await this.initializeTenantSchema(dbName);
    await this.createTenantIndices(dbName);
  }

  async createFederationRelationship(
    sourceOrgId: string,
    targetOrgId: string,
    relationshipType: string,
    sharingLevel: string,
    createdBy: string
  ): Promise<string> {
    const relationshipId = crypto.randomUUID();
    
    await this.db.query(`
      INSERT INTO federation_relationships (
        id, source_org_id, target_org_id, 
        relationship_type, sharing_level, 
        created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, now())
    `, [relationshipId, sourceOrgId, targetOrgId, relationshipType, sharingLevel, createdBy]);

    return relationshipId;
  }

  async getFederatedOrganizations(
    organizationId: string
  ): Promise<FederatedOrganization[]> {
    const query = `
      SELECT 
        o.id, o.name, o.domain,
        fr.relationship_type, fr.sharing_level,
        fr.approved_at, fr.is_active
      FROM organizations o
      JOIN federation_relationships fr ON (
        (fr.source_org_id = $1 AND fr.target_org_id = o.id) OR
        (fr.target_org_id = $1 AND fr.source_org_id = o.id)
      )
      WHERE fr.is_active = true
        AND fr.approved_at IS NOT NULL
      ORDER BY o.name
    `;

    const result = await this.db.query(query, [organizationId]);
    return result.rows;
  }

  async checkResourceQuota(
    organizationId: string,
    resourceType: string,
    requestedAmount: number = 1
  ): Promise<boolean> {
    const usage = await this.getResourceUsage(organizationId);
    const quota = usage[resourceType as keyof ResourceQuotas];
    
    if (!quota || !quota.limit) return true; // No limit set
    
    return (quota.used + requestedAmount) <= quota.limit;
  }

  async incrementResourceUsage(
    organizationId: string,
    resourceType: string,
    amount: number = 1
  ): Promise<void> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await this.db.query(`
      INSERT INTO tenant_resource_usage (
        organization_id, resource_type, 
        period_start, period_end, usage_amount
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (organization_id, resource_type, period_start)
      DO UPDATE SET 
        usage_amount = tenant_resource_usage.usage_amount + $5,
        created_at = now()
    `, [organizationId, resourceType, periodStart, periodEnd, amount]);
  }

  private async initializeTenantSchema(dbName: string): Promise<void> {
    // Initialize tenant-specific tables
    const schemas = [
      'CREATE TABLE tenant_search_indices (...)',
      'CREATE TABLE tenant_content_chunks (...)',
      'CREATE TABLE tenant_embeddings (...)',
      // Add all necessary tenant-specific tables
    ];

    for (const schema of schemas) {
      await this.db.query(schema);
    }
  }

  private calculatePermissions(
    membership: any,
    organization: any
  ): TenantPermissions {
    const basePermissions = membership.permissions || {};
    const rolePermissions = this.getRolePermissions(membership.role);
    
    return {
      ...basePermissions,
      ...rolePermissions,
      canFederate: organization.federation_settings?.enabled && membership.role === 'admin'
    };
  }

  private getRolePermissions(role: string): Partial<TenantPermissions> {
    switch (role) {
      case 'owner':
        return {
          canManageOrg: true,
          canManageUsers: true,
          canManageBilling: true,
          canFederate: true,
          canSearch: true,
          canCollaborate: true
        };
      case 'admin':
        return {
          canManageUsers: true,
          canFederate: true,
          canSearch: true,
          canCollaborate: true
        };
      case 'member':
        return {
          canSearch: true,
          canCollaborate: true
        };
      default:
        return { canSearch: true };
    }
  }
}
```

#### Acceptance Criteria
- [ ] Complete tenant isolation at all system levels
- [ ] Federation protocol enables secure cross-tenant search
- [ ] Resource quotas enforced with real-time monitoring
- [ ] Horizontal scaling with tenant-aware load balancing
- [ ] Comprehensive audit logging for compliance requirements
- [ ] Performance monitoring and alerting per tenant
- [ ] Database migration tools for tenant schema management

---

### Work Item 4.2.2: Cross-Organization Search Federation
**Agent**: @agent-nodejs-backend-engineer  
**Estimated Time**: 2 weeks  
**Priority**: High

#### Technical Requirements
- Secure API protocol for cross-organization search queries
- Content syndication with granular sharing controls
- Distributed query planning and result aggregation
- Trust network management and verification
- Performance optimization for federated queries

#### Implementation Files

**Federation Protocol Service**
```typescript
// core/src/services/federation/federation-protocol.ts
import { TenantContext } from '../multi-tenant/tenant-service';
import { UnifiedSearchService } from '../search/unified-search-service';

export interface FederationQuery {
  query: string;
  filters: SearchFilters;
  targetOrganizations: string[];
  sharingLevel: 'metadata' | 'content' | 'full';
  sourceContext: TenantContext;
}

export interface FederatedSearchResult {
  organizationId: string;
  organizationName: string;
  results: SearchResult[];
  metadata: {
    totalResults: number;
    searchTime: number;
    sharingLevel: string;
  };
  error?: string;
}

export class FederationProtocolService {
  private searchService: UnifiedSearchService;
  private trustNetwork: TrustNetworkManager;
  private queryRouter: FederatedQueryRouter;

  constructor(
    searchService: UnifiedSearchService,
    trustNetwork: TrustNetworkManager,
    queryRouter: FederatedQueryRouter
  ) {
    this.searchService = searchService;
    this.trustNetwork = trustNetwork;
    this.queryRouter = queryRouter;
  }

  async executeFederatedSearch(
    query: FederationQuery
  ): Promise<FederatedSearchResult[]> {
    // Validate federation permissions
    const authorizedOrgs = await this.validateFederationAccess(
      query.sourceContext.organizationId,
      query.targetOrganizations,
      query.sharingLevel
    );

    if (authorizedOrgs.length === 0) {
      throw new Error('No authorized organizations for federation search');
    }

    // Distribute query to authorized organizations
    const searchPromises = authorizedOrgs.map(orgId =>
      this.executeFederatedQuery(query, orgId)
    );

    // Execute searches in parallel with timeout
    const results = await Promise.allSettled(
      searchPromises.map(promise => 
        Promise.race([
          promise,
          new Promise<FederatedSearchResult>((_, reject) => 
            setTimeout(() => reject(new Error('Federation search timeout')), 10000)
          )
        ])
      )
    );

    // Process and return results
    return results
      .map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            organizationId: authorizedOrgs[index],
            organizationName: 'Unknown',
            results: [],
            metadata: {
              totalResults: 0,
              searchTime: 0,
              sharingLevel: query.sharingLevel
            },
            error: result.reason.message
          };
        }
      })
      .filter(result => result !== null);
  }

  private async executeFederatedQuery(
    query: FederationQuery,
    targetOrgId: string
  ): Promise<FederatedSearchResult> {
    const startTime = Date.now();

    try {
      // Create federation-scoped context
      const federationContext = await this.createFederationContext(
        query.sourceContext,
        targetOrgId,
        query.sharingLevel
      );

      // Execute search with federation filters
      const searchParams = {
        ...query,
        organizationId: targetOrgId,
        federationLevel: query.sharingLevel
      };

      const searchResults = await this.searchService.search(searchParams);
      
      // Filter results based on sharing level
      const filteredResults = this.filterResultsBySharingLevel(
        searchResults.results,
        query.sharingLevel
      );

      return {
        organizationId: targetOrgId,
        organizationName: federationContext.organizationName,
        results: filteredResults,
        metadata: {
          totalResults: filteredResults.length,
          searchTime: Date.now() - startTime,
          sharingLevel: query.sharingLevel
        }
      };
    } catch (error) {
      return {
        organizationId: targetOrgId,
        organizationName: 'Unknown',
        results: [],
        metadata: {
          totalResults: 0,
          searchTime: Date.now() - startTime,
          sharingLevel: query.sharingLevel
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async validateFederationAccess(
    sourceOrgId: string,
    targetOrgIds: string[],
    sharingLevel: string
  ): Promise<string[]> {
    const authorizedOrgs: string[] = [];

    for (const targetOrgId of targetOrgIds) {
      const relationship = await this.trustNetwork.getRelationship(
        sourceOrgId,
        targetOrgId
      );

      if (relationship && this.isSharingLevelAuthorized(relationship, sharingLevel)) {
        authorizedOrgs.push(targetOrgId);
      }
    }

    return authorizedOrgs;
  }

  private filterResultsBySharingLevel(
    results: SearchResult[],
    sharingLevel: string
  ): SearchResult[] {
    return results.map(result => {
      switch (sharingLevel) {
        case 'metadata':
          return {
            ...result,
            content: '[Content hidden - metadata only]',
            summary: result.summary?.substring(0, 100) + '...'
          };
        case 'content':
          return {
            ...result,
            // Remove sensitive fields but keep content
            internalNotes: undefined,
            privateMetadata: undefined
          };
        case 'full':
          return result;
        default:
          return {
            id: result.id,
            title: result.title,
            type: result.type,
            score: result.score,
            content: '[Content hidden]'
          } as SearchResult;
      }
    });
  }

  private isSharingLevelAuthorized(
    relationship: FederationRelationship,
    requestedLevel: string
  ): boolean {
    const levelHierarchy = ['metadata', 'content', 'full'];
    const allowedLevel = relationship.sharing_level;
    const requestedIndex = levelHierarchy.indexOf(requestedLevel);
    const allowedIndex = levelHierarchy.indexOf(allowedLevel);

    return requestedIndex <= allowedIndex;
  }
}

export class TrustNetworkManager {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  async getRelationship(
    sourceOrgId: string,
    targetOrgId: string
  ): Promise<FederationRelationship | null> {
    const query = `
      SELECT * FROM federation_relationships
      WHERE ((source_org_id = $1 AND target_org_id = $2) OR
             (source_org_id = $2 AND target_org_id = $1))
        AND is_active = true
        AND approved_at IS NOT NULL
    `;

    const result = await this.db.query(query, [sourceOrgId, targetOrgId]);
    return result.rows[0] || null;
  }

  async establishTrust(
    sourceOrgId: string,
    targetOrgId: string,
    relationshipType: string,
    sharingLevel: string
  ): Promise<void> {
    // Implementation for establishing trust relationships
  }

  async revokeTrust(
    sourceOrgId: string,
    targetOrgId: string
  ): Promise<void> {
    // Implementation for revoking trust relationships
  }
}
```

#### Acceptance Criteria
- [ ] Secure cross-organization search protocol implemented
- [ ] Granular content sharing controls based on relationship type
- [ ] Distributed query execution with fault tolerance
- [ ] Trust network management with verification mechanisms
- [ ] Performance optimization for federated queries under 5 seconds
- [ ] Complete audit trail for all federation activities
- [ ] Error handling and graceful degradation for unavailable organizations

---

## Work Item 4.3: Advanced Synchronization & Conflict Resolution

### Work Item 4.3.1: Event Sourcing & Version Control System
**Agent**: @agent-nodejs-backend-engineer  
**Estimated Time**: 3 weeks  
**Priority**: High

#### Technical Requirements
- Complete event sourcing architecture for collaborative features
- CQRS pattern with separate read/write models
- Conflict-free replicated data types (CRDTs) for distributed synchronization
- Time-travel debugging and audit capabilities
- Snapshot management for performance optimization

#### Database Schema for Event Sourcing
```sql
-- Event Store
CREATE TABLE event_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    version BIGINT NOT NULL,
    correlation_id UUID,
    causation_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID NOT NULL REFERENCES users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    UNIQUE(stream_id, version),
    INDEX idx_event_store_stream (stream_id),
    INDEX idx_event_store_type (event_type),
    INDEX idx_event_store_created_at (created_at),
    INDEX idx_event_store_organization (organization_id),
    INDEX idx_event_store_correlation (correlation_id)
);

-- Event Projections (Read Models)
CREATE TABLE search_projections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projection_name VARCHAR(100) NOT NULL,
    stream_id VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    version BIGINT NOT NULL,
    last_event_id UUID NOT NULL REFERENCES event_store(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(projection_name, stream_id),
    INDEX idx_projections_name (projection_name),
    INDEX idx_projections_stream (stream_id),
    INDEX idx_projections_version (version)
);

-- Snapshots for Performance
CREATE TABLE event_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id VARCHAR(255) NOT NULL,
    snapshot_type VARCHAR(100) NOT NULL,
    snapshot_data JSONB NOT NULL,
    version BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(stream_id, snapshot_type),
    INDEX idx_snapshots_stream (stream_id),
    INDEX idx_snapshots_version (version),
    INDEX idx_snapshots_expires (expires_at)
);

-- Conflict Resolution Log
CREATE TABLE conflict_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id VARCHAR(255) NOT NULL,
    conflict_type VARCHAR(100) NOT NULL,
    conflicting_events UUID[] NOT NULL,
    resolution_strategy VARCHAR(100) NOT NULL,
    resolved_event_id UUID NOT NULL REFERENCES event_store(id),
    resolved_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}',
    INDEX idx_conflict_stream (stream_id),
    INDEX idx_conflict_type (conflict_type),
    INDEX idx_conflict_created_at (created_at)
);
```

#### Implementation Files

**Event Sourcing Infrastructure**
```typescript
// core/src/services/event-sourcing/event-store.ts
export interface DomainEvent {
  id: string;
  streamId: string;
  eventType: string;
  eventData: Record<string, any>;
  metadata: EventMetadata;
  version: number;
  correlationId?: string;
  causationId?: string;
  createdAt: Date;
  createdBy: string;
  organizationId: string;
}

export interface EventMetadata {
  source: string;
  timestamp: Date;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface AggregateRoot {
  id: string;
  version: number;
  uncommittedEvents: DomainEvent[];
  
  markEventsAsCommitted(): void;
  loadFromHistory(events: DomainEvent[]): void;
}

export class EventStore {
  private db: DatabaseManager;
  private eventBus: EventBus;

  constructor(db: DatabaseManager, eventBus: EventBus) {
    this.db = db;
    this.eventBus = eventBus;
  }

  async saveEvents(
    streamId: string,
    expectedVersion: number,
    events: DomainEvent[]
  ): Promise<void> {
    const connection = await this.db.getConnection();
    
    try {
      await connection.query('BEGIN');

      // Check for concurrency conflicts
      const currentVersion = await this.getCurrentVersion(streamId, connection);
      if (currentVersion !== expectedVersion) {
        throw new ConcurrencyError(
          `Expected version ${expectedVersion}, but current version is ${currentVersion}`
        );
      }

      // Insert events
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const newVersion = expectedVersion + i + 1;

        await connection.query(`
          INSERT INTO event_store (
            id, stream_id, event_type, event_data, metadata,
            version, correlation_id, causation_id, created_by, organization_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          event.id,
          streamId,
          event.eventType,
          JSON.stringify(event.eventData),
          JSON.stringify(event.metadata),
          newVersion,
          event.correlationId,
          event.causationId,
          event.createdBy,
          event.organizationId
        ]);

        // Publish event to event bus
        this.eventBus.publish(event);
      }

      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }

  async getEvents(
    streamId: string,
    fromVersion?: number,
    toVersion?: number
  ): Promise<DomainEvent[]> {
    let query = `
      SELECT * FROM event_store 
      WHERE stream_id = $1
    `;
    const params: any[] = [streamId];

    if (fromVersion !== undefined) {
      query += ' AND version >= $2';
      params.push(fromVersion);
    }

    if (toVersion !== undefined) {
      const versionParam = fromVersion !== undefined ? '$3' : '$2';
      query += ` AND version <= ${versionParam}`;
      params.push(toVersion);
    }

    query += ' ORDER BY version ASC';

    const result = await this.db.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      streamId: row.stream_id,
      eventType: row.event_type,
      eventData: row.event_data,
      metadata: row.metadata,
      version: row.version,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      createdAt: row.created_at,
      createdBy: row.created_by,
      organizationId: row.organization_id
    }));
  }

  async saveSnapshot(
    streamId: string,
    snapshotType: string,
    snapshotData: any,
    version: number
  ): Promise<void> {
    await this.db.query(`
      INSERT INTO event_snapshots (
        stream_id, snapshot_type, snapshot_data, version
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (stream_id, snapshot_type) 
      DO UPDATE SET 
        snapshot_data = $3,
        version = $4,
        created_at = now()
    `, [streamId, snapshotType, JSON.stringify(snapshotData), version]);
  }

  async getSnapshot(
    streamId: string,
    snapshotType: string
  ): Promise<{ data: any; version: number } | null> {
    const result = await this.db.query(`
      SELECT snapshot_data, version FROM event_snapshots
      WHERE stream_id = $1 AND snapshot_type = $2
        AND (expires_at IS NULL OR expires_at > now())
    `, [streamId, snapshotType]);

    if (result.rows.length === 0) return null;

    return {
      data: result.rows[0].snapshot_data,
      version: result.rows[0].version
    };
  }

  private async getCurrentVersion(
    streamId: string,
    connection: any
  ): Promise<number> {
    const result = await connection.query(`
      SELECT COALESCE(MAX(version), 0) as version
      FROM event_store 
      WHERE stream_id = $1
    `, [streamId]);

    return result.rows[0].version;
  }
}

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}
```

**Conflict Resolution Service**
```typescript
// core/src/services/collaboration/conflict-resolution.ts
export interface ConflictResolutionStrategy {
  name: string;
  resolve(conflicts: ConflictingEvent[]): Promise<DomainEvent>;
}

export interface ConflictingEvent {
  event: DomainEvent;
  conflictReason: string;
  affectedFields: string[];
}

export class ConflictResolutionService {
  private strategies = new Map<string, ConflictResolutionStrategy>();
  private eventStore: EventStore;

  constructor(eventStore: EventStore) {
    this.eventStore = eventStore;
    this.registerDefaultStrategies();
  }

  async resolveConflict(
    streamId: string,
    conflictingEvents: ConflictingEvent[],
    strategyName: string,
    resolvedBy: string
  ): Promise<DomainEvent> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown conflict resolution strategy: ${strategyName}`);
    }

    // Apply resolution strategy
    const resolvedEvent = await strategy.resolve(conflictingEvents);

    // Log the conflict resolution
    await this.logConflictResolution(
      streamId,
      conflictingEvents,
      strategyName,
      resolvedEvent,
      resolvedBy
    );

    return resolvedEvent;
  }

  private registerDefaultStrategies(): void {
    // Last-Write-Wins Strategy
    this.strategies.set('last-write-wins', {
      name: 'last-write-wins',
      resolve: async (conflicts: ConflictingEvent[]): Promise<DomainEvent> => {
        const latestEvent = conflicts
          .sort((a, b) => b.event.createdAt.getTime() - a.event.createdAt.getTime())[0];
        
        return latestEvent.event;
      }
    });

    // First-Write-Wins Strategy
    this.strategies.set('first-write-wins', {
      name: 'first-write-wins',
      resolve: async (conflicts: ConflictingEvent[]): Promise<DomainEvent> => {
        const earliestEvent = conflicts
          .sort((a, b) => a.event.createdAt.getTime() - b.event.createdAt.getTime())[0];
        
        return earliestEvent.event;
      }
    });

    // Merge Strategy (for compatible changes)
    this.strategies.set('merge', {
      name: 'merge',
      resolve: async (conflicts: ConflictingEvent[]): Promise<DomainEvent> => {
        const baseEvent = conflicts[0].event;
        const mergedData = { ...baseEvent.eventData };

        // Merge non-conflicting fields
        for (let i = 1; i < conflicts.length; i++) {
          const event = conflicts[i].event;
          const conflictingFields = conflicts[i].affectedFields;
          
          Object.keys(event.eventData).forEach(key => {
            if (!conflictingFields.includes(key)) {
              mergedData[key] = event.eventData[key];
            }
          });
        }

        return {
          ...baseEvent,
          eventData: mergedData,
          metadata: {
            ...baseEvent.metadata,
            mergedFromEvents: conflicts.map(c => c.event.id)
          }
        };
      }
    });

    // User Priority Strategy
    this.strategies.set('user-priority', {
      name: 'user-priority',
      resolve: async (conflicts: ConflictingEvent[]): Promise<DomainEvent> => {
        // This would typically use a user priority system
        // For now, prioritize by user role or explicit priority
        const prioritizedEvent = conflicts
          .sort((a, b) => this.getUserPriority(a.event.createdBy) - this.getUserPriority(b.event.createdBy))[0];
        
        return prioritizedEvent.event;
      }
    });
  }

  private async logConflictResolution(
    streamId: string,
    conflicts: ConflictingEvent[],
    strategy: string,
    resolvedEvent: DomainEvent,
    resolvedBy: string
  ): Promise<void> {
    await this.eventStore.db.query(`
      INSERT INTO conflict_resolutions (
        stream_id, conflict_type, conflicting_events,
        resolution_strategy, resolved_event_id, resolved_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      streamId,
      conflicts[0]?.conflictReason || 'unknown',
      conflicts.map(c => c.event.id),
      strategy,
      resolvedEvent.id,
      resolvedBy,
      JSON.stringify({
        conflictCount: conflicts.length,
        affectedFields: conflicts.flatMap(c => c.affectedFields)
      })
    ]);
  }

  private getUserPriority(userId: string): number {
    // Implementation would fetch user role/priority from database
    // Higher priority = lower number (0 = highest priority)
    return 1; // Default priority
  }
}
```

#### Acceptance Criteria
- [ ] Complete event sourcing architecture with CQRS pattern
- [ ] Automatic conflict detection and resolution strategies
- [ ] Time-travel debugging capabilities for collaboration sessions
- [ ] Performance-optimized with snapshot management
- [ ] Complete audit trail for all collaborative actions
- [ ] Horizontal scalability with event store partitioning
- [ ] Comprehensive test coverage including conflict scenarios

---

## Phase 4 Summary & Integration

### Timeline Overview
- **Work Item 4.1**: Real-time Collaboration Infrastructure (4 weeks)
- **Work Item 4.2**: Federation Architecture (5 weeks)  
- **Work Item 4.3**: Advanced Synchronization (3 weeks)

**Total Phase 4 Duration**: 10-12 weeks

### Success Metrics
- **Collaboration Performance**: Support 500+ concurrent users per session
- **Federation Response Time**: Cross-organization queries complete within 5 seconds
- **Conflict Resolution**: 99% automatic conflict resolution with <1 second latency
- **Data Consistency**: Zero data loss with eventual consistency across distributed nodes
- **System Scalability**: Linear horizontal scaling with tenant isolation

### Integration Testing Strategy
- **Load Testing**: Simulate 10,000+ concurrent collaborative sessions
- **Federation Testing**: Multi-organization search scenarios with varying trust levels
- **Conflict Testing**: Comprehensive conflict generation and resolution validation
- **Disaster Recovery**: Complete system recovery testing with zero data loss
- **Security Testing**: Penetration testing for multi-tenant isolation and federation security

### Deployment Architecture
- **Microservices**: Independent deployment of collaboration, federation, and synchronization services
- **Database Sharding**: Tenant-aware database partitioning for optimal performance
- **Global Distribution**: Multi-region deployment with local federation nodes
- **Monitoring**: Real-time performance monitoring with tenant-specific dashboards
- **Backup & Recovery**: Automated backup with point-in-time recovery capabilities

This completes Phase 4 of the unified search platform roadmap, establishing a comprehensive collaborative knowledge ecosystem with enterprise-grade federation and synchronization capabilities. The system now supports real-time collaboration, cross-organizational search, and advanced conflict resolution, making it suitable for large-scale distributed knowledge management deployments.